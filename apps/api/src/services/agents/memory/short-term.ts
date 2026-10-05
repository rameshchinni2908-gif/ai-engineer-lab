/** Short-term memory: the running in-context scratchpad for one agent run - every step's content, in order. */
export interface ShortTermEntry {
  stepIndex: number;
  role: "agent" | "tool";
  content: string;
}

export class ShortTermMemory {
  #buffer: ShortTermEntry[] = [];

  write(entry: ShortTermEntry): void {
    this.#buffer.push(entry);
  }

  all(): ShortTermEntry[] {
    return [...this.#buffer];
  }
}
