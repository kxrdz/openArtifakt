/**
 * Agent-loop state machine (§8 "States").
 *
 * The loop's lifecycle is modelled as an explicit state machine:
 *
 * `idle → streaming → awaiting_approval → executing_tool → streaming → … → done | error | cancelled`
 *
 * {@link AgentStateMachine} enforces the legal transitions so the UI can show
 * the current state at all times and no host can silently skip a phase.
 */

export const AGENT_STATES = [
  "idle",
  "streaming",
  "awaiting_approval",
  "executing_tool",
  "done",
  "error",
  "cancelled",
] as const;

export type AgentState = (typeof AGENT_STATES)[number];

/** States a turn ends in; no transition leaves them. */
export const TERMINAL_STATES: ReadonlySet<AgentState> = new Set(["done", "error", "cancelled"]);

/** Legal transitions from each state. */
const TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  idle: ["streaming"],
  streaming: ["awaiting_approval", "executing_tool", "done", "error", "cancelled"],
  awaiting_approval: ["executing_tool", "streaming", "error", "cancelled"],
  executing_tool: ["streaming", "done", "error", "cancelled"],
  done: [],
  error: [],
  cancelled: [],
};

/** True when the loop may move directly from `from` to `to`. */
export function isValidTransition(from: AgentState, to: AgentState): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * A small transition guard the agent loop owns. It starts in `idle`, advances
 * only through legal transitions, and settles in one of the terminal states.
 */
export class AgentStateMachine {
  #state: AgentState = "idle";

  /** The current state. */
  get state(): AgentState {
    return this.#state;
  }

  /** True when the loop has reached a terminal state. */
  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this.#state);
  }

  /**
   * Advance to `to`, throwing when the transition is not legal. This catches
   * host bugs early rather than letting the loop drift into an impossible
   * state.
   */
  transition(to: AgentState): void {
    if (!isValidTransition(this.#state, to)) {
      throw new Error(`Invalid agent state transition: ${this.#state} -> ${to}`);
    }
    this.#state = to;
  }

  /** Return to `idle` for the next turn. */
  reset(): void {
    this.#state = "idle";
  }
}
