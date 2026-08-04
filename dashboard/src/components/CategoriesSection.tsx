import { getCategoryGroups, type CategoryGroup } from "@/lib/data";
import { presentCategory } from "@/lib/categories";
import { verifySession } from "@/lib/dal";
import { MessageCard } from "./MessageCard";

export async function CategoriesSection({ highlightId }: { highlightId?: string }) {
  const userId = await verifySession();
  const groups = await getCategoryGroups(userId, highlightId);
  const hasAnyMessages = groups.some((g) => g.total > 0);

  if (!hasAnyMessages) {
    return (
      <div className="fade-in rounded-xl border border-dashed border-paper-line bg-paper-raised/60 p-8 text-center">
        <p className="text-muted">
          Todavía no hay ningún mensaje guardado. Escríbele algo al bot de
          Telegram y aparecerá aquí, categorizado y resumido.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <CategoryCard key={group.categoria} group={group} highlightId={highlightId} />
      ))}
    </div>
  );
}

function CategoryCard({ group, highlightId }: { group: CategoryGroup; highlightId?: string }) {
  const { Icon, label, color, colorSoft } = presentCategory(group.categoria);
  const headingId = `categoria-${group.categoria}`;

  return (
    <section aria-labelledby={headingId} className="fade-in flex flex-col gap-3">
      <h2
        id={headingId}
        className="flex items-center gap-2 font-display text-base font-semibold text-ink"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${colorSoft} ${color}`}>
          <Icon aria-hidden size={15} />
        </span>
        {label}
        <span className="ml-auto rounded-full bg-paper-line/60 px-2 py-0.5 text-xs font-medium text-muted">
          {group.total}
        </span>
      </h2>

      {group.messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-paper-line p-4 text-sm text-muted">
          Nada por aquí todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {group.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              showCategory={false}
              highlighted={message.id === highlightId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
