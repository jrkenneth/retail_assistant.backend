export type ToolResult<TData> = {
  tool: string;
  version: string;
  data: TData;
  citation?: {
    label: string;
    source: string;
    uri?: string;
  };
};

