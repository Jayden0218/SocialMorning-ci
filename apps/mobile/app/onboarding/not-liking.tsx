// "Not liking these?": tell For You what is wrong and change your categories.
/** M22 US5 (FR-019): opened from the line under For You; the form is src/ui/discover/RecFeedback.tsx. M31 S-C (T061): the form draws the whole page. */
import { router } from 'expo-router';
import { RecFeedbackForm } from '@/ui/discover/RecFeedback';

export default function NotLikingScreen(): React.ReactElement {
  return <RecFeedbackForm onSent={() => router.back()} />;
}
