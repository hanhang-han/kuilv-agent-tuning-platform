import { ReviewClient } from './review-client';

export default async function ReviewCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <ReviewClient caseId={caseId} />;
}
