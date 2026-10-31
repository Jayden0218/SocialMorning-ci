// Wallet › Redeem a code: type a code from SocialNet and get PLUS days or a paid series, free.
/**
 * M24 US15 (spec 025, lane A3). A code is a free gift from SocialNet (made in Admin) — nothing is
 * bought here. The field groups the code in fours as it is typed; the server takes it with or
 * without dashes. One use per code per account; the server limits tries (10 an hour).
 */
import { useState } from 'react';
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { shortDate } from '@/ui/kit/format';
import { ApiError } from '@/social/api';
import { codeReady, grantLine, groupCode, useAccountApi } from '@/social/account-api';
import { GlowTile, KeyboardPage } from '@/ui/me/lists';
import { REDEEM, STAGE_TYPE } from '@/ui/wallet/measures';
import { Big, Line } from '@/ui/wallet/stage';

export default function RedeemScreen(): React.ReactElement {
  const api = useAccountApi();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  // The foot grows by the error line, so the title bar above it is lifted by what is measured.
  const [foot, setFoot] = useState<number>(REDEEM.field + REDEEM.belowGap + hit.min);
  const ready = codeReady(code);

  async function redeem() {
    setBusy(true);
    setError(undefined);
    try {
      const g = await api.redeem(code);
      setDone(grantLine(g, (iso) => shortDate(Date.parse(iso))));
      setCode('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const ring = error !== undefined && code !== '' ? colour.hot : colour.line;
  return (
    <KeyboardPage>
      <PushedPage
        title="Redeem a code"
        size={REDEEM.titleSize}
        tone="none"
        belowHeight={foot}
        below={(
          <Box testID="redeem-foot" style={{ gap: REDEEM.belowGap }} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h !== foot) setFoot(h); }}>
            <Input testID="redeem-field" className="bg-raise2 justify-center" style={{ height: REDEEM.field, borderRadius: REDEEM.fieldRadius, borderWidth: 1, borderColor: ring }}>
              <InputField
                placeholderTextColor={colour.text3}
                placeholder="XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={40}
                value={code}
                onChangeText={(v) => { setCode(groupCode(v)); setError(undefined); }}
                accessibilityLabel="Code"
                className="text-text font-mono font-semibold"
                style={[STAGE_TYPE.code, { paddingHorizontal: REDEEM.fieldPad }]}
              />
            </Input>
            {error ? <Line size="line14" tone="hot" live>{error}</Line> : null}
            <PulseButton label="Redeem" onPress={() => void redeem()} disabled={!ready} busy={busy} full />
          </Box>
        )}
      >
        {(layout) => (
          <>
            <PageGlow top={REDEEM.glowTop} strength={REDEEM.glowStrength} />
            <Box testID="redeem-tile" className="absolute left-0 right-0 items-center" pointerEvents="none" style={{ top: layout.top + REDEEM.tileTop }}><GlowTile icon="ticket-outline" size={REDEEM.tile} rotate={REDEEM.tileRotate} /></Box>
            <Box testID="redeem-words" className="absolute" style={{ left: REDEEM.textSide, right: REDEEM.textSide, top: layout.top + REDEEM.textTop, gap: REDEEM.textGap }}>
              <Big size="big30">Have a code?</Big>
              {done ? (
                <Box testID="redeem-done" className="flex-row items-center bg-hotSoft" style={{ borderRadius: REDEEM.doneRadius, padding: REDEEM.donePad, gap: REDEEM.doneGap }} accessible accessibilityLiveRegion="polite" accessibilityLabel={done}>
                  <Icon name="checkmark-circle" size={REDEEM.doneIcon} color={colour.hotText} />
                  <Type step="row" className="text-text flex-1">{done}</Type>
                </Box>
              ) : (
                <Line size="line15">A code from SocialNet gives you PLUS days or a paid series, free. Each code works once per account.</Line>
              )}
            </Box>
          </>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}
