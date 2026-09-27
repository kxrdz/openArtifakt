import { useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { useChatStore } from "../../store/chatStore";
import { Button, cn, focusRing, SendIcon, StopIcon } from "../ui";

/** The tallest the composer grows before its textarea scrolls (px). */
const MAX_COMPOSER_HEIGHT = 160;

/**
 * The message composer (§12.6, "Composer"): a growing text input with Send /
 * Stop. While a turn is in flight the Send action becomes Stop. Keyboard
 * first: Enter sends, Shift+Enter inserts a newline, and the textarea keeps a
 * visible focus ring.
 */
export function Composer() {
  const isSending = useChatStore((state) => state.isSending);
  const send = useChatStore((state) => state.send);
  const stop = useChatStore((state) => state.stop);

  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim() !== "" && !isSending;

  // Grow (and shrink back) with the content, capped so long drafts scroll
  // instead of pushing the conversation out of view.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [value]);

  function submit() {
    if (!canSend) return;
    void send(value);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter (and IME composition) insert a newline.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 items-end gap-2 border-t border-border bg-bg-elevated p-3"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        aria-label="Message OpenArtifact"
        placeholder={isSending ? "OpenArtifact is working…" : "Message OpenArtifact"}
        className={cn(
          "min-h-8 max-h-40 flex-1 resize-none rounded-md border border-border bg-bg-sunken px-3 py-1.5 text-sm leading-normal text-text placeholder:text-text-muted",
          focusRing,
        )}
      />
      {isSending ? (
        <Button
          type="button"
          variant="danger"
          icon={<StopIcon className="h-4 w-4" />}
          onClick={stop}
        >
          Stop
        </Button>
      ) : (
        <Button
          type="submit"
          variant="primary"
          icon={<SendIcon className="h-4 w-4" />}
          disabled={!canSend}
        >
          Send
        </Button>
      )}
    </form>
  );
}
