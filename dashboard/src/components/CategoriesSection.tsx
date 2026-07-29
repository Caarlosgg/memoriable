import { getCategoryGroups, type CategoryGroup } from "@/lib/data";
import { presentCategory } from "@/lib/categories";
import { MessageCard } from "./MessageCard";

export async function CategoriesSection() {
  const groups = await getCategoryGroups();
  const hasAnyMessages = groups.some((g) => g.total > 0);

  if (!hasAnyMessages) {
    return (
      <div className="fade-in rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <p className="text-slate-500">
          Todavía no hay ningún mensaje guardado. Escríbele algo al bot de
          Telegram y aparecerá aquí, categorizado y resumido.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <CategoryCard key={group.categoria} group={group} />
      ))}
    </div>
  );
}

function CategoryCard({ group }: { group: CategoryGroup }) {
  const { emoji, label } = presentCategory(group.categoria);
  const headingId = `categoria-${group.categoria}`;

  return (
    <section aria-labelledby={headingId} className="fade-in flex flex-col gap-3">
      <h2
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold text-slate-700"
      >
        <span aria-hidden>{emoji}</span>
        {label}
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {group.total}
        </span>
      </h2>

      {group.messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
          Nada por aquí todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {group.messages.map((message) => (
            <MessageCard key={message.id} message={message} showCategory={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
