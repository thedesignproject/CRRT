import { useId, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "../lib/utils";
import { CarrotMark } from "./carrot-mark";

export type NavItem = {
  id: string;
  label: string;
  /** Navigates like a link. Omit and pass onSelect for views without a URL. */
  href?: string;
  onSelect?: () => void;
  count?: number;
  live?: boolean;
  /** Project exists but nothing has reached it yet (no pin, no agent call). */
  pending?: boolean;
  icon?: ReactNode;
};

type AppShellProps = {
  workspace?: string;
  /** Makes the CRRT mark a link, e.g. back to the marketing site. */
  homeHref?: string;
  /** Accessible name for that link. */
  homeLabel?: string;
  /** Workspace-level views: Inbox, Next steps, Agent runs, Recordings, Brain. */
  nav: NavItem[];
  /** Projects section. A live dot means an agent is working there right now. */
  projects?: NavItem[];
  activeId: string;
  /** Shown instead of the project list while it is empty: loading, error or "no projects". */
  projectsEmpty?: ReactNode;
  onNewProject?: () => void;
  /** Pinned to the bottom of the sidebar (e.g. SetupChecklist); under the projects on small screens. */
  sidebarFooter?: ReactNode;
  /** Bar above the content (TopBar). */
  topBar?: ReactNode;
  children: ReactNode;
  className?: string;
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Tag = item.href ? "a" : "button";
  return (
    <Tag
      {...(item.href ? { href: item.href } : { type: "button" as const })}
      onClick={item.onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full text-left",
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4 [&_svg]:text-text-subtle",
        active ? "bg-sidebar-accent font-medium text-text-strong" : "text-sidebar-foreground hover:bg-surface-3"
      )}
    >
      {item.icon}
      <span className={cn("truncate", item.pending && !active && "text-text-subtle")}>{item.label}</span>
      {item.pending && (
        <span className="ml-auto flex items-center gap-1.5 text-xs text-status-agent-fg">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-agent-working motion-reduce:animate-none" />
          <span className="sr-only">Waiting for first pin</span>
        </span>
      )}
      {!item.pending && (item.count != null || item.live) && (
        <span className={cn("ml-auto flex items-center gap-1.5 font-mono text-xs", item.live ? "text-carrot" : "text-text-subtle")}>
          {item.live && (
            <>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-carrot shadow-[0_0_8px_var(--carrot)]" />
              <span className="sr-only">Agent working</span>
            </>
          )}
          {item.count}
        </span>
      )}
    </Tag>
  );
}

/** A vertical list of nav items; AppShell uses it, and sidebar footers can too. */
export function NavList({ items, activeId }: { items: NavItem[]; activeId: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <NavLink item={item} active={item.id === activeId} />
        </li>
      ))}
    </ul>
  );
}

/** Dashboard frame: surface-1 sidebar + surface-2 main. Every dashboard screen uses it. */
export function AppShell({
  workspace,
  homeHref,
  homeLabel = "CRRT home",
  nav,
  projects,
  projectsEmpty,
  activeId,
  onNewProject,
  sidebarFooter,
  topBar,
  children,
  className,
}: AppShellProps) {
  const projectsHeadingId = useId();
  return (
    <div className={cn("flex min-h-dvh flex-wrap bg-surface-2 font-sans text-sm text-text-strong", className)}>
      <nav
        aria-label="Workspace"
        className="flex w-full flex-col gap-5 border-b border-sidebar-border bg-sidebar px-3 py-4 md:max-h-dvh md:w-58 md:border-r md:border-b-0"
      >
        <div className="flex items-center gap-2.5 px-1.5">
          {homeHref ? (
            <a
              href={homeHref}
              aria-label={homeLabel}
              className="flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <CarrotMark />
              <span aria-hidden="true" className="font-semibold">CRRT</span>
            </a>
          ) : (
            <>
              <CarrotMark />
              <span className="font-semibold">CRRT</span>
            </>
          )}
          {workspace && <span className="ml-auto truncate text-xs text-text-subtle">{workspace}</span>}
        </div>
        <NavList items={nav} activeId={activeId} />
        {projects && (
          <section aria-labelledby={projectsHeadingId} className="flex min-h-0 flex-col gap-1">
            <div className="flex items-center justify-between px-2">
              <h2 id={projectsHeadingId} className="text-xs font-medium text-text-subtle">
                Projects
              </h2>
              {onNewProject && (
                <button
                  type="button"
                  onClick={onNewProject}
                  aria-label="New project"
                  className="rounded-md p-1 text-text-subtle hover:bg-surface-3 hover:text-text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
            {projects.length === 0 && projectsEmpty ? (
              <div className="px-2 text-xs text-text-subtle">{projectsEmpty}</div>
            ) : (
              // Capped on small screens, where the sidebar sits above the content.
              <ul className="flex max-h-48 min-h-0 flex-col gap-0.5 overflow-y-auto md:max-h-none">
                {projects.map((item) => (
                  <li key={item.id}>
                    <NavLink item={item} active={item.id === activeId} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {sidebarFooter && <div className="md:mt-auto">{sidebarFooter}</div>}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-[999_1_560px] flex-col">
        {topBar}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

type TopBarProps = {
  /** Breadcrumb segments, last one is the current page. */
  crumbs: string[];
  /** Right side: quota, actions, search. */
  children?: ReactNode;
};

/** Where you are (breadcrumb) on the left, quota and actions on the right. */
export function TopBar({ crumbs, children }: TopBarProps) {
  return (
    <header className="flex min-h-13 flex-wrap items-center gap-x-4 gap-y-2 border-b border-sidebar-border bg-surface-1 px-5 py-2">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-text-strong" : "text-text-subtle"}>
                  {crumb}
                </span>
                {!last && <span aria-hidden="true" className="text-agent-idle">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-3">{children}</div>
    </header>
  );
}
