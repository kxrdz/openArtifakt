/**
 * Static fixture responses for the stream-parser fuzz test (§5). Each `.txt`
 * body is the full raw model text for one scenario; the fuzz test feeds each
 * one whole, split at every boundary, and at deterministic random multi-split
 * points, asserting the normalized event sequences are identical.
 */

import artifactInFence from "./artifact-in-fence.txt?raw";
import fallbackToolCall from "./fallback-tool-call.txt?raw";
import mermaidFence from "./mermaid-fence.txt?raw";
import proseLiteralAngle from "./prose-literal-angle.txt?raw";
import splitArtifactTags from "./split-artifact-tags.txt?raw";
import unclosedArtifact from "./unclosed-artifact.txt?raw";

export interface Fixture {
  name: string;
  text: string;
}

export const fixtures: Fixture[] = [
  { name: "prose-literal-angle", text: proseLiteralAngle },
  { name: "split-artifact-tags", text: splitArtifactTags },
  { name: "artifact-in-fence", text: artifactInFence },
  { name: "mermaid-fence", text: mermaidFence },
  { name: "fallback-tool-call", text: fallbackToolCall },
  { name: "unclosed-artifact", text: unclosedArtifact },
];
