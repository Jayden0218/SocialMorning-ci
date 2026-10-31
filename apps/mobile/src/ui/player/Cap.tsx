// The drawing's small caption: Geist Mono 11, tracked, upper case, in the third text colour.
/**
 * M31 round 2 (design-pulse2 `listen.html` `.cap`: `font:500 11px/1 var(--mono); letter-spacing:.08em;
 * text-transform:uppercase; color:#8A8893`). The Playback sheet's "SPEED" and "SLEEP", the sleep clock's "PAUSING IN"
 * and the clip composer's "START" / "END" use it. The build had used the Edge step (Unbounded, 0.24 em) for these, which is a
 * different face and three times the tracking. The words are upper-cased here, so a caller passes them as written.
 */
import { Type } from '@/ui/kit/Type';
import { PLAYER } from './measures';

export function Cap(props: { children: string; tone?: 'text3' | 'hotText'; accessibilityRole?: 'header'; style?: object }): React.ReactElement {
  return (
    <Type
      step="mono"
      className={props.tone === 'hotText' ? 'text-hotText' : 'text-text3'}
      style={[{ fontSize: PLAYER.capSize, lineHeight: PLAYER.capLine, letterSpacing: PLAYER.capTracking }, props.style]}
      {...(props.accessibilityRole ? { accessibilityRole: props.accessibilityRole } : {})}
    >
      {props.children.toUpperCase()}
    </Type>
  );
}
