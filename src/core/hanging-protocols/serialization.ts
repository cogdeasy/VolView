import {
  HANGING_PROTOCOL_FILE_VERSION,
  hangingProtocolFile,
  type HangingProtocol,
  type HangingProtocolFile,
} from '@/src/core/hanging-protocols/types';

export const HANGING_PROTOCOL_FILE_KIND =
  'philips-volume-viewer-hanging-protocols' as const;

export const toProtocolFile = (
  protocols: HangingProtocol[]
): HangingProtocolFile => ({
  kind: HANGING_PROTOCOL_FILE_KIND,
  version: HANGING_PROTOCOL_FILE_VERSION,
  protocols,
});

export const serializeProtocols = (protocols: HangingProtocol[]) =>
  JSON.stringify(toProtocolFile(protocols), null, 2);

export class ProtocolParseError extends Error {}

export function parseProtocols(text: string): HangingProtocol[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProtocolParseError('The file is not valid JSON.');
  }

  const result = hangingProtocolFile.safeParse(raw);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = issue?.path.join('.') ?? '';
    throw new ProtocolParseError(
      `Not a valid hanging protocol file${where ? ` (${where}: ${issue.message})` : ''}.`
    );
  }

  return result.data.protocols;
}
