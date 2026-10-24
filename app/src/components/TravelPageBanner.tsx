type TravelPage = "discover" | "trips" | "ideas" | "profile";

const PAGE_IMAGES: Record<TravelPage, { src: string; alt: string; caption: string }> = {
  discover: {
    src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=85",
    alt: "A winding road through a sunlit mountain landscape",
    caption: "The best journeys are better shared",
  },
  trips: {
    src: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1800&q=85",
    alt: "A quiet alpine lake surrounded by mountains",
    caption: "Make room for the places you’ll remember",
  },
  ideas: {
    src: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1800&q=85",
    alt: "A colorful hillside village overlooking the coast",
    caption: "Somewhere new is closer than you think",
  },
  profile: {
    src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=85",
    alt: "A mountain lake and forest beneath a bright open sky",
    caption: "Plan a trip that feels like yours",
  },
};

export function TravelPageBanner({ page }: { page: TravelPage }) {
  const image = PAGE_IMAGES[page];

  return (
    <div className={`travel-page-banner travel-page-banner-${page}`}>
      <img src={image.src} alt={image.alt} loading="lazy" />
      <div className="travel-page-banner-veil" />
      <p>{image.caption}</p>
    </div>
  );
}
