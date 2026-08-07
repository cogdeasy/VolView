import { describe, it, expect } from 'vitest';

import {
  contrastRatio,
  contrastRatioRounded,
  meetsContrast,
  parseHexColor,
  relativeLuminance,
} from '@/src/utils/contrast';

describe('contrast', () => {
  it('parses hex colors in every accepted form', () => {
    expect(parseHexColor('#00A3E0')).to.deep.equal({ r: 0, g: 163, b: 224 });
    expect(parseHexColor('00a3e0')).to.deep.equal({ r: 0, g: 163, b: 224 });
    expect(parseHexColor('#fff')).to.deep.equal({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('#00A3E0FF')).to.deep.equal({ r: 0, g: 163, b: 224 });
    expect(() => parseHexColor('cyan')).to.throw();
  });

  it('computes relative luminance at the extremes', () => {
    expect(relativeLuminance('#000000')).to.equal(0);
    expect(relativeLuminance('#FFFFFF')).to.equal(1);
  });

  it('matches the WCAG reference ratio for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).to.equal(21);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).to.equal(1);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio('#00A3E0', '#FFFFFF')).to.equal(
      contrastRatio('#FFFFFF', '#00A3E0')
    );
  });

  it('reproduces the reported accent defect', () => {
    // The known open defect: white on the brand accent cyan.
    expect(contrastRatioRounded('#FFFFFF', '#00A3E0')).to.equal(2.87);
    // ...and the fix quoted in the ticket.
    expect(contrastRatioRounded('#000000', '#00A3E0')).to.equal(7.32);
  });

  it('applies the AA threshold', () => {
    expect(meetsContrast('#FFFFFF', '#00A3E0')).to.equal(false);
    expect(meetsContrast('#FFFFFF', '#00647E')).to.equal(true);
    expect(meetsContrast('#FFFFFF', '#00A3E0', 2)).to.equal(true);
  });
});
