const Feature: React.FC<{
  name: string
  description: string
  children: React.ReactNode
}> = (props) => {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
        {props.children}
      </div>
      <div>
        <p className="text-lg font-semibold leading-7 text-gray-900">
          {props.name}
        </p>
        <p className="mt-1 text-base leading-7 text-gray-600">
          {props.description}
        </p>
      </div>
    </div>
  )
}

export default Feature
