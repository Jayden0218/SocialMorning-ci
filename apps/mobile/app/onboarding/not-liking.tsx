// "Not liking these?": tell For You what is wrong and change your categories.
/** M22 US5 (FR-019): opened from the line under For You; the form is `useRecFeedbackForm` in src/ui/discover/RecFeedback.tsx. M31 S-C (T061): the form draws the whole page. 039: on the Form frame. */
import { router } from 'expo-router';
import { FormPage } from '@/ui/form/FormPage';
import { AUTH } from '@/ui/auth/measures';
import { useRecFeedbackForm } from '@/ui/discover/RecFeedback';

export default function NotLikingScreen(): React.ReactElement {
  const form = useRecFeedbackForm(() => router.back());
  return (
    <FormPage title="Not liking these?" subtitle="Your answer changes For You on its next refresh." now={false} below={form.below} belowHeight={AUTH.foot.button}>
      {form.body}
    </FormPage>
  );
}
