import { getQuickJS, type QuickJSWASMModule } from 'quickjs-emscripten';

import { createDBApi, createLoggerApi, replaceAll } from './sandbox-api';
import type { SandboxApp, SandboxRequest, SandboxResponse } from './types';

let modulePromise: Promise<QuickJSWASMModule> | null = null;

function getModule(): Promise<QuickJSWASMModule> {
  if (!modulePromise) {
    modulePromise = getQuickJS();
  }
  return modulePromise;
}

/**
 * Build a self-contained JS bundle that includes:
 * 1. An in-memory DB implementation (backed by a snapshot of current data)
 * 2. A Logger stub
 * 3. The user's backend code
 * 4. A call to handleRequest() with the serialized request
 *
 * Returns a JSON string with response + mutated DB state + logs.
 */
function buildSandboxCode(
  backendCode: string,
  dbSnapshot: Record<string, unknown>[],
  req: SandboxRequest
): string {
  return `
var __db_records = ${JSON.stringify(dbSnapshot)};

var DB = {
  getAll: function() { return __db_records; },
  getById: function(id) {
    for (var i = 0; i < __db_records.length; i++) {
      if (__db_records[i].id === id) return __db_records[i];
    }
    return null;
  },
  insert: function(record) {
    var newRecord = {};
    var keys = Object.keys(record);
    for (var i = 0; i < keys.length; i++) {
      newRecord[keys[i]] = record[keys[i]];
    }
    newRecord.id = 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    newRecord.createdAt = new Date().toISOString();
    __db_records.push(newRecord);
    return newRecord;
  },
  update: function(id, data) {
    for (var i = 0; i < __db_records.length; i++) {
      if (__db_records[i].id === id) {
        var keys = Object.keys(data);
        for (var j = 0; j < keys.length; j++) {
          __db_records[i][keys[j]] = data[keys[j]];
        }
        __db_records[i].id = id;
        return true;
      }
    }
    return false;
  },
  remove: function(id) {
    var len = __db_records.length;
    __db_records = __db_records.filter(function(r) { return r.id !== id; });
    return __db_records.length < len;
  },
  query: function(filter) {
    var filterKeys = Object.keys(filter);
    return __db_records.filter(function(record) {
      for (var i = 0; i < filterKeys.length; i++) {
        if (record[filterKeys[i]] !== filter[filterKeys[i]]) return false;
      }
      return true;
    });
  }
};

var __logs = [];
var Logger = {
  info: function(msg) { __logs.push({ level: 'info', msg: String(msg) }); },
  error: function(msg) { __logs.push({ level: 'error', msg: String(msg) }); }
};

${backendCode}

var __request = ${JSON.stringify(req)};
var __response = handleRequest(__request);

JSON.stringify({
  response: __response,
  dbRecords: __db_records,
  logs: __logs
});
`;
}

interface SandboxResult {
  response: SandboxResponse;
  dbRecords: Record<string, unknown>[];
  logs: Array<{ level: string; msg: string }>;
}

export async function createSandboxApp(
  backendCode: string,
  appId: string,
  dataPath: string
): Promise<SandboxApp> {
  const module = await getModule();

  // Validate backend code compiles at creation time
  const testVm = module.newContext();
  try {
    const testResult = testVm.evalCode(`${backendCode}\ntypeof handleRequest === 'function'`);
    if (testResult.error) {
      const err = testVm.dump(testResult.error);
      testResult.error.dispose();
      throw new Error(`Backend code compilation failed: ${String(err)}`);
    }
    const isValid = testVm.dump(testResult.value);
    testResult.value.dispose();
    if (isValid !== true) {
      throw new Error('Backend code must export a handleRequest function');
    }
  } finally {
    testVm.dispose();
  }

  const db = createDBApi(dataPath);
  const logger = createLoggerApi(appId);

  // Serialize requests to prevent concurrent snapshot-then-overwrite data loss
  let requestQueue: Promise<SandboxResponse> = Promise.resolve({
    status: 200,
    headers: {},
    body: ''
  });

  const executeRequest = async (req: SandboxRequest): Promise<SandboxResponse> => {
    const dbSnapshot = db.getAll();
    const code = buildSandboxCode(backendCode, dbSnapshot, req);

    const vm = module.newContext();

    // Set memory limit (32MB)
    vm.runtime.setMemoryLimit(32 * 1024 * 1024);

    // Set CPU time limit (5 seconds)
    const deadline = Date.now() + 5000;
    vm.runtime.setInterruptHandler(() => Date.now() > deadline);

    try {
      const result = vm.evalCode(code);

      if (result.error) {
        const errorVal = vm.dump(result.error);
        result.error.dispose();

        const errorMsg = typeof errorVal === 'object' ? JSON.stringify(errorVal) : String(errorVal);
        logger.error(`Sandbox error: ${errorMsg}`);

        return {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Internal sandbox error', details: errorMsg })
        };
      }

      const resultJson = vm.dump(result.value) as string;
      result.value.dispose();

      const parsed = JSON.parse(resultJson) as SandboxResult;

      // Sync DB changes back to host
      syncDbChanges(dataPath, dbSnapshot, parsed.dbRecords);

      // Replay logs
      for (const log of parsed.logs) {
        if (log.level === 'error') logger.error(log.msg);
        else logger.info(log.msg);
      }

      const res = parsed.response;
      return {
        status: res?.status ?? 500,
        headers: res?.headers ?? { 'Content-Type': 'application/json' },
        body: typeof res?.body === 'string' ? res.body : JSON.stringify(res?.body ?? '')
      };
    } finally {
      vm.dispose();
    }
  };

  const handleRequest = (req: SandboxRequest): Promise<SandboxResponse> => {
    requestQueue = requestQueue.then(
      () => executeRequest(req),
      () => executeRequest(req)
    );
    return requestQueue;
  };

  return {
    handleRequest,
    dispose: () => {
      db.close();
    }
  };
}

/** Sync sandbox DB changes back to host by replacing the entire dataset.
 * This preserves sandbox-generated IDs so frontend references remain valid. */
function syncDbChanges(
  dbPath: string,
  original: Record<string, unknown>[],
  updated: Record<string, unknown>[]
): void {
  if (JSON.stringify(original) !== JSON.stringify(updated)) {
    replaceAll(dbPath, updated);
  }
}
