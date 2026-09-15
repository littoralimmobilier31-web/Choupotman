import { PageHeader, Section, SummaryStrip } from '@/components/admin/page-kit';
import { TestimonialManager } from '@/components/admin/testimonial-manager';
import { FaqManager } from '@/components/admin/faq-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listFaqs, listTestimonials } from '@/lib/db/repositories/content';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Témoignages et FAQ' };

export default async function TestimonialsPage() {
  const user = await requirePermission('testimonials.view');
  const csrf = (await getCsrfToken()) ?? '';

  const testimonials = listTestimonials({ limit: 200 });
  const faqs = listFaqs();

  const published = testimonials.filter((testimonial) => testimonial.is_published === 1);
  const rated = testimonials.filter((testimonial) => testimonial.rating !== null);
  const average =
    rated.length > 0
      ? rated.reduce((total, testimonial) => total + (testimonial.rating ?? 0), 0) / rated.length
      : null;

  return (
    <>
      <PageHeader
        title="Témoignages et FAQ"
        description="Ce que vos clients ont écrit, et les réponses aux questions qu’ils posent le plus souvent."
      />

      <SummaryStrip
        items={[
          { label: 'Témoignages publiés', value: published.length },
          { label: 'En attente', value: testimonials.length - published.length },
          { label: 'Note moyenne', value: average !== null ? `${average.toFixed(1)} / 5` : '—' },
          { label: 'Questions publiées', value: faqs.filter((faq) => faq.is_published === 1).length },
        ]}
      />

      <div className="mt-6 space-y-8">
        <Section
          title="Témoignages clients"
          description="Recopiés tels quels. Rien n’est rédigé ni reformulé automatiquement : un témoignage sur le site est une phrase qu’un client a réellement écrite."
        >
          <TestimonialManager
            csrf={csrf}
            canEdit={can(user, 'testimonials.update')}
            canDelete={can(user, 'testimonials.delete')}
            clients={clientOptions().map((client) => ({ value: String(client.id), label: client.label }))}
            projects={projectOptions().map((project) => ({ value: String(project.id), label: project.label }))}
            testimonials={testimonials.map((testimonial) => ({
              id: testimonial.id,
              author_name: testimonial.author_name,
              author_role: testimonial.author_role,
              company: testimonial.company,
              avatar_url: testimonial.avatar_url,
              quote: testimonial.quote,
              rating: testimonial.rating,
              client_id: testimonial.client_id,
              project_id: testimonial.project_id,
              locale: testimonial.locale,
              is_published: testimonial.is_published,
              is_demo: testimonial.is_demo,
              position: testimonial.position,
            }))}
          />
        </Section>

        <Section
          title="Questions fréquentes"
          description="Affichées sous la page Services. Elles alimentent aussi la base de connaissances du chatbot public, qui ne répond qu’à partir de ce qui est écrit ici."
        >
          <FaqManager
            csrf={csrf}
            canEdit={can(user, 'services.update')}
            canDelete={can(user, 'services.delete')}
            faqs={faqs.map((faq) => ({
              id: faq.id,
              question: faq.question,
              answer: faq.answer,
              category: faq.category,
              position: faq.position,
              is_published: faq.is_published,
            }))}
          />
        </Section>
      </div>
    </>
  );
}
