const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'csv']);
const DOCUMENT_EXTENSIONS = new Set(['docx', 'pdf']);
const IMAGE_EXTENSIONS = new Set([
  'png',
  'apng',
  'avif',
  'gif',
  'jpg',
  'jpeg',
  'jfif',
  'pjpeg',
  'pjp',
  'svg',
  'webp',
  'bmp',
  'ico',
  'cur',
  'heic',
  'heif',
  'tif',
  'tiff'
]);

type PromptCategory = 'spreadsheet' | 'document' | 'image' | 'other';

interface PromptSuggestionFile {
  name: string;
  type?: string;
}

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getPromptCategory(file: PromptSuggestionFile): PromptCategory {
  const extension = getFileExtension(file.name);

  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return 'spreadsheet';
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return 'document';
  }

  if (file.type?.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  return 'other';
}

export function suggestPromptForFiles(files: PromptSuggestionFile[]): string | null {
  if (files.length === 0) {
    return null;
  }

  const categories = new Set(files.map(getPromptCategory));
  if (categories.size !== 1) {
    return null;
  }

  const [category] = categories;
  switch (category) {
    case 'spreadsheet':
      return '您想对这个表格做什么？分析数据、生成图表、还是其他？';
    case 'document':
      return '您想对这个文档做什么？总结、翻译、提取信息、还是其他？';
    case 'image':
      return '您想对这张图片做什么？描述内容、提取文字、还是其他？';
    default:
      return null;
  }
}
