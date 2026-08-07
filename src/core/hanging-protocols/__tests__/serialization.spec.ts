import { describe, it, expect } from 'vitest';
import {
  parseProtocols,
  serializeProtocols,
  ProtocolParseError,
} from '@/src/core/hanging-protocols/serialization';
import { BUILT_IN_PROTOCOLS } from '@/src/core/hanging-protocols/seeds';
import { WINDOW_LEVEL_PRESETS } from '@/src/core/hanging-protocols/windowPresets';

describe('hanging protocol serialization', () => {
  it('round-trips the built-in protocols', () => {
    const protocols = [...BUILT_IN_PROTOCOLS];
    expect(parseProtocols(serializeProtocols(protocols))).toEqual(protocols);
  });

  it('rejects a file that is not JSON', () => {
    expect(() => parseProtocols('not json')).toThrow(ProtocolParseError);
  });

  it('rejects a file of another kind', () => {
    const text = JSON.stringify({ kind: 'something-else', protocols: [] });
    expect(() => parseProtocols(text)).toThrow(ProtocolParseError);
  });

  it('rejects a protocol with an unknown window/level kind', () => {
    const [protocol] = BUILT_IN_PROTOCOLS;
    const text = serializeProtocols([
      { ...protocol, windowLevel: { kind: 'psychic' } } as never,
    ]);
    expect(() => parseProtocols(text)).toThrow(ProtocolParseError);
  });
});

describe('window level presets', () => {
  it('uses the standard brain window', () => {
    expect(WINDOW_LEVEL_PRESETS['ct-brain']).toMatchObject({
      width: 80,
      level: 40,
    });
  });

  it('uses the standard lung window', () => {
    expect(WINDOW_LEVEL_PRESETS['ct-lung']).toMatchObject({
      width: 1500,
      level: -600,
    });
  });
});
