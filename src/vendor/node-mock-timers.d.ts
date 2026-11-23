import type { MockTimers as NodeMockTimers } from 'node:test'

export declare class MockTimers implements NodeMockTimers {
  enable: NodeMockTimers['enable']
  tick: NodeMockTimers['tick']
  runAll: NodeMockTimers['runAll']
  setTime: NodeMockTimers['setTime']
  reset: NodeMockTimers['reset'];
  [Symbol.dispose](): void
}
