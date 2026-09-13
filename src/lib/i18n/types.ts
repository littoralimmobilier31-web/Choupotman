/**
 * Shape of a translation dictionary. Every locale file must satisfy this type,
 * so a missing key is a compile-time error rather than a runtime blank.
 */
export type Dictionary = {
  meta: { siteTitle: string; siteDescription: string; ogAlt: string };
  nav: {
    home: string; about: string; services: string; projects: string;
    caseStudies: string; blog: string; contact: string; requestQuote: string;
    adminSpace: string; clientSpace: string; menu: string; close: string;
    language: string; theme: string; themeLight: string; themeDark: string; themeSystem: string;
  };
  home: {
    eyebrow: string; ctaProjects: string; ctaWork: string; ctaQuote: string; ctaContact: string;
    skillsTitle: string; skillsSubtitle: string; servicesTitle: string; servicesSubtitle: string;
    servicesCta: string; recentTitle: string; recentSubtitle: string; selectedTitle: string;
    selectedSubtitle: string; allProjects: string; techTitle: string; techSubtitle: string;
    statsTitle: string; testimonialsTitle: string; testimonialsSubtitle: string;
    contactTitle: string; contactSubtitle: string; processTitle: string; processSubtitle: string;
  };
  about: {
    title: string; subtitle: string; journey: string; experience: string; skills: string;
    tools: string; technologies: string; certifications: string; expertise: string;
    interests: string; timeline: string; present: string; emptySection: string;
  };
  services: {
    title: string; subtitle: string; includes: string; startingFrom: string; onQuote: string;
    deliverables: string; requestThis: string; empty: string;
  };
  projects: {
    title: string; subtitle: string; search: string; filters: string; allCategories: string;
    allTechnologies: string; allYears: string; resetFilters: string; resultCount: string;
    empty: string; client: string; year: string; category: string; status: string;
    technologies: string; servicesDone: string; challenge: string; objectives: string;
    solution: string; results: string; gallery: string; videos: string; links: string;
    visitSite: string; testimonial: string; files: string; nextProject: string;
    previousProject: string; backToProjects: string; caseStudy: string;
    demoBadge: string; demoNotice: string;
  };
  caseStudy: {
    title: string; subtitle: string; problem: string; objectives: string; strategy: string;
    solution: string; development: string; tools: string; result: string; metrics: string;
    gallery: string; testimonial: string; next: string; readingTime: string; empty: string;
  };
  blog: {
    title: string; subtitle: string; readMore: string; publishedOn: string; updatedOn: string;
    by: string; categories: string; tags: string; allPosts: string; related: string;
    search: string; empty: string; readingTime: string;
  };
  contact: {
    title: string; subtitle: string; name: string; email: string; phone: string; company: string;
    service: string; budget: string; deadline: string; message: string; file: string;
    fileHint: string; send: string; sending: string; successTitle: string; successBody: string;
    errorTitle: string; selectPlaceholder: string; orChat: string; directContact: string;
    followMe: string; required: string; optional: string;
  };
  request: {
    title: string; subtitle: string; step: string; of: string; next: string; back: string;
    submit: string; submitting: string;
    steps: {
      who: string; project: string; goal: string; services: string; budget: string;
      deadline: string; references: string; files: string; contactDetails: string;
    };
    thanksTitle: string; thanksBody: string; backHome: string;
  };
  chatbot: {
    title: string; subtitle: string; open: string; close: string; placeholder: string;
    send: string; thinking: string; greeting: string; suggestions: string[];
    leadCaptured: string; disclaimer: string; poweredBy: string;
  };
  footer: {
    tagline: string; navigation: string; services: string; legal: string; privacy: string;
    terms: string; rights: string; builtWith: string; backToTop: string;
  };
  common: {
    loading: string; error: string; retry: string; save: string; cancel: string; delete: string;
    edit: string; create: string; search: string; filter: string; all: string; none: string;
    yes: string; no: string; notSet: string; readMore: string; viewAll: string; download: string;
    share: string; copy: string; copied: string; notFoundTitle: string; notFoundBody: string;
    errorTitle: string; errorBody: string; skipToContent: string;
  };
};
