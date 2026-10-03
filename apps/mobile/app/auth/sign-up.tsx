// No screen: old link, sends you to the email sign-in page.
/**
 * Create an account. Since the owner dropped passwords (2026-09-27) the email page does
 * both: a new email gets a code, then a name. This route stays so old links still land.
 */
import { Redirect } from 'expo-router';

export default function SignUpScreen(): React.ReactElement {
  return <Redirect href="/auth/email" />;
}
