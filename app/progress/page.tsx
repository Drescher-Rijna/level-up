import ProgressionApp from "@/components/progression-app";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string | string[] }>;
}) {
  const { baseline } = await searchParams;
  return <ProgressionApp openBaseline={baseline === "1"} />;
}
