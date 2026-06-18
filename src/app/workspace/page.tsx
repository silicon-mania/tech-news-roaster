import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Workspace } from "@/components/workspace";
import { cn } from "@/lib/utils";

/**
 * The relocated generation Workspace. The Workspace component is reused
 * unchanged; this thin route wrapper only adds a "back to Runs" link that
 * returns to the feed (the landing page). The link sits opposite the Workspace's
 * own top-left runs-sidebar trigger so the two don't collide.
 */
export default function WorkspacePage() {
  return (
    <>
      <Link
        href="/"
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "fixed top-4 right-4 z-50 text-muted-foreground",
        )}>
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        Runs
      </Link>

      <Workspace />
    </>
  );
}
