// "Not liking these?": tell For You what is wrong and change your categories.
/** M22 US5 (FR-019): opened from the line under For You; the form is src/ui/discover/RecFeedback.tsx. */
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { PageHeader } from '@/ui/kit/PageHeader';
import { RecFeedbackForm } from '@/ui/discover/RecFeedback';

export default function NotLikingScreen(): React.ReactElement {
  return (
    <>
      <PageHeader title="Not liking these?" subtitle="Your answer changes For You on its next refresh." />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section">
        <RecFeedbackForm onSent={() => router.back()} />
      </ScrollView>
    </>
  );
}
