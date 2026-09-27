import type { ReactNode } from "react";
import {
  Badge,
  Button,
  CheckIcon,
  ChevronRightIcon,
  IconButton,
  Kbd,
  PanelRightIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Spinner,
  StatusDot,
  StopIcon,
  TerminalIcon,
  XIcon,
} from "./index";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="text-sm font-medium text-text-secondary">{title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

function LabeledDot({
  tone,
  pulse = false,
  children,
}: {
  tone: "success" | "warning" | "danger" | "running" | "neutral";
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}

/**
 * A throwaway screen that exercises every primitive for the screenshots pass.
 * Feature 6 replaces `App.tsx` with the real workspace shell; this file stays
 * available as a living style guide.
 */
export function UiPreview() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-fg">
          <PanelRightIcon className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">OpenArtifact</h1>
          <p className="text-xs text-text-muted">
            Design system — UI primitives
          </p>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <Section title="Buttons">
          <Button variant="primary" icon={<PlayIcon className="h-4 w-4" />}>
            Run tests
          </Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Learn more</Button>
          <Button variant="danger">Reject</Button>
          <Button variant="primary" size="sm" icon={<PlusIcon className="h-4 w-4" />}>
            New
          </Button>
          <Button variant="primary" loading>
            Running…
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Section>

        <Section title="Icon buttons">
          <IconButton aria-label="Settings" icon={<SettingsIcon className="h-4 w-4" />} />
          <IconButton
            aria-label="Toggle panel"
            variant="secondary"
            icon={<PanelRightIcon className="h-4 w-4" />}
          />
          <IconButton
            aria-label="Stop"
            variant="danger"
            icon={<StopIcon className="h-4 w-4" />}
          />
          <IconButton aria-label="Approve" icon={<CheckIcon className="h-4 w-4" />} />
          <IconButton aria-label="Close" size="sm" icon={<XIcon className="h-3.5 w-3.5" />} />
          <IconButton aria-label="Loading" loading icon={<ChevronRightIcon className="h-4 w-4" />} />
        </Section>

        <Section title="Badges">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="accent">Current</Badge>
          <Badge tone="success">Passed</Badge>
          <Badge tone="warning">3 warnings</Badge>
          <Badge tone="danger">Failed</Badge>
          <Badge tone="running">Running</Badge>
          <Badge tone="neutral">
            <StatusDot tone="success" /> 2 files changed
          </Badge>
        </Section>

        <Section title="Status">
          <LabeledDot tone="success">Success</LabeledDot>
          <LabeledDot tone="warning">Warning</LabeledDot>
          <LabeledDot tone="danger">Error</LabeledDot>
          <LabeledDot tone="running" pulse>
            Running
          </LabeledDot>
          <LabeledDot tone="neutral">Idle</LabeledDot>
        </Section>

        <Section title="Keyboard">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd>Esc</Kbd>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            Press <Kbd>Enter</Kbd> to send · <Kbd>Esc</Kbd> to stop
          </span>
        </Section>

        <Section title="Spinner">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <span className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-accent-fg">
            <Spinner size="sm" tone="inverse" label="Working" />
            <span className="text-xs font-medium">Working…</span>
          </span>
        </Section>

        <Section title="Terminal · Chat · Panel">
          <Button variant="ghost" icon={<TerminalIcon className="h-4 w-4" />}>
            Terminal log
          </Button>
          <Button variant="ghost" icon={<PanelRightIcon className="h-4 w-4" />}>
            Artifact panel
          </Button>
        </Section>
      </div>
    </div>
  );
}
