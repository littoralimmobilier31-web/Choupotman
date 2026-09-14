import 'server-only';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';
import { serviceOptions } from '@/lib/db/repositories/content';
import { defaultCurrency, defaultTaxRate } from '@/lib/db/repositories/finance';

/**
 * Select options shared by the quote and invoice editors.
 *
 * Both screens need exactly the same three lists plus the finance defaults;
 * loading them in one place keeps the four pages that render `DocumentForm`
 * consistent and avoids four copies of the same mapping drifting apart.
 */
export function documentOptions() {
  return {
    clients: clientOptions().map((client) => ({
      id: client.id,
      label: client.label,
      currency: client.currency,
    })),
    projects: projectOptions().map((project) => ({
      id: project.id,
      label: project.label,
      client_id: project.client_id,
      currency: project.currency,
    })),
    services: serviceOptions().map((service) => ({
      id: service.id,
      name: service.label,
      starting_price: service.price,
      currency: defaultCurrency(),
    })),
    currency: defaultCurrency(),
    taxRate: defaultTaxRate(),
  };
}
