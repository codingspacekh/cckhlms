// Pre-launch review: one IPv6 home or phone connection gets a whole /64, so the per-address sign-in limit
// (FR-AUTH-11) counts the /64, not each address in it.
import { describe, expect, it } from 'vitest';
import { addressKey } from '@/server/sign-in-limit';

describe('the address a failed sign-in counts against', () => {
  it('is the address itself for IPv4', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('is the /64 for IPv6, however the address is written', () => {
    expect(addressKey('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64');
    expect(addressKey('2001:DB8:AA:BB::99')).toBe('2001:db8:aa:bb::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('2001:0db8:00aa:00bb:ffff::')).toBe('2001:db8:aa:bb::/64');
  });

  it('keeps anything else as it came', () => {
    expect(addressKey('not-an-address')).toBe('not-an-address');
  });
});
