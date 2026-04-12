declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';

  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
    lineNumber?: boolean;
  }

  const taskLists: PluginWithOptions<TaskListsOptions>;
  export default taskLists;
}

declare module 'markdown-it-mark' {
  import type { PluginSimple } from 'markdown-it';
  const mark: PluginSimple;
  export default mark;
}

declare module 'markdown-it-sup' {
  import type { PluginSimple } from 'markdown-it';
  const sup: PluginSimple;
  export default sup;
}

declare module 'markdown-it-sub' {
  import type { PluginSimple } from 'markdown-it';
  const sub: PluginSimple;
  export default sub;
}
