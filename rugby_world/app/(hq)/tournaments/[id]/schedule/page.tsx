import { redirect } from "next/navigation";

export default async function TournamentScheduleRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tournaments/${id}/fixtures`);
}
