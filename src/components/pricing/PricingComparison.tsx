import { Icon } from "@/components/ui/Icon";
import {
  comparisonRowStatus,
  pricingComparisonSections,
  pricingPackages,
  type PricingCellStatus,
} from "@/content/pricing";

const statusLabel: Record<PricingCellStatus, string> = {
  included: "Included",
  excluded: "Not included",
  agreement: "By agreement",
};

function Cell({ status }: { status: PricingCellStatus }) {
  if (status === "included") {
    return (
      <>
        <Icon name="check-circle" size={20} className="inline-block text-accent-mint" />
        <span className="sr-only">{statusLabel.included}</span>
      </>
    );
  }
  if (status === "agreement") {
    return <span className="text-[0.6875rem] font-medium leading-4 text-ink-muted sm:text-xs">{statusLabel.agreement}</span>;
  }
  return (
    <>
      <span aria-hidden="true" className="text-lg leading-none text-ink-muted/60">
        –
      </span>
      <span className="sr-only">{statusLabel.excluded}</span>
    </>
  );
}

export function PricingComparison() {
  return (
    <div className="overflow-hidden rounded-panel border border-border-subtle bg-surface-raised shadow-panel">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">
          Comparison of the capabilities included in Document, Document + Media, and Enterprise
        </caption>
        <colgroup>
          <col className="w-[40%] sm:w-[49%]" />
          {pricingPackages.map((plan) => (
            <col key={plan.slug} className="w-[20%] sm:w-[17%]" />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border-subtle bg-surface-active">
            <th scope="col" className="px-4 py-4 align-bottom font-heading text-sm font-semibold text-ink sm:px-6 sm:py-5">
              Capability
            </th>
            {pricingPackages.map((plan) => (
              <th key={plan.slug} scope="col" className="px-0.5 py-4 text-center align-bottom min-[380px]:px-1 sm:px-4 sm:py-5">
                <span className="block font-heading text-[0.6875rem] font-semibold leading-4 text-ink min-[380px]:text-xs sm:text-sm">
                  {plan.shortName}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {pricingComparisonSections.map((section) => (
          <tbody key={section.title}>
            <tr className="border-b border-border-subtle bg-surface-active/50">
              <th
                scope="colgroup"
                colSpan={pricingPackages.length + 1}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.09em] text-accent-cool sm:px-6"
              >
                {section.title}
              </th>
            </tr>
            {section.rows.map((row) => (
              <tr key={row.capability} className="border-b border-border-subtle last:border-b-0">
                <th scope="row" className="px-4 py-3.5 text-sm font-medium leading-6 text-ink sm:px-6">
                  {row.capability}
                </th>
                {pricingPackages.map((plan) => (
                  <td key={plan.slug} data-status={comparisonRowStatus(plan, row)} className="px-1 py-3.5 text-center sm:px-4">
                    <Cell status={comparisonRowStatus(plan, row)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className="border-t border-border-subtle px-4 py-3 text-xs leading-5 text-ink-muted sm:px-6">
        Enterprise agreements include the Document or Document + Media capabilities your organization chooses.
      </p>
    </div>
  );
}
