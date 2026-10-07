// Tests the tablet layout rule: wide at 768 pt, phone below a 600 pt shortest side.
import { layoutFor, WIDE_MIN, PHONE_SHORT_SIDE } from '@/ui/shell/useLayout';

describe('layoutFor (M22 US16, T069)', () => {
  it('a phone in portrait or landscape is never wide and is a phone', () => {
    expect(layoutFor(390, 844)).toMatchObject({ wide: false, phone: true });
    expect(layoutFor(844, 390)).toMatchObject({ wide: false, phone: true }); // sideways is still a phone
    expect(layoutFor(430, 932).wide).toBe(false);
  });

  it('an iPad is wide in both orientations and is not a phone', () => {
    expect(layoutFor(820, 1180)).toMatchObject({ wide: true, phone: false });
    expect(layoutFor(1180, 820)).toMatchObject({ wide: true, phone: false });
  });

  it('a narrow Split View on an iPad uses the phone layout', () => {
    expect(layoutFor(375, 820)).toMatchObject({ wide: false, phone: true });
    expect(layoutFor(694, 820)).toMatchObject({ wide: false, phone: false });
  });

  it('the edges: 768 is wide, 767 is not; 600 is not a phone, 599 is', () => {
    expect(layoutFor(WIDE_MIN, 1000).wide).toBe(true);
    expect(layoutFor(WIDE_MIN - 1, 1000).wide).toBe(false);
    expect(layoutFor(PHONE_SHORT_SIDE, 1000).phone).toBe(false);
    expect(layoutFor(PHONE_SHORT_SIDE - 1, 1000).phone).toBe(true);
    expect(layoutFor(1000, PHONE_SHORT_SIDE - 1).wide).toBe(false);
  });
});
