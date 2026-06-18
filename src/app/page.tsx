import { RunsFeed } from "@/components/runs-feed";
import { parseDiscoverySourceListIds } from "@/services/discovery";

export default function Home() {
  // Read and parse the Discovery Source list ids server-side; only the resulting
  // id array crosses to the client feed, so the raw `DISCOVERY_SOURCE_LIST_IDS`
  // env var never enters the client bundle.
  const discoverySourceListIds = parseDiscoverySourceListIds(process.env.DISCOVERY_SOURCE_LIST_IDS);

  return <RunsFeed discoverySourceListIds={discoverySourceListIds} />;
}
