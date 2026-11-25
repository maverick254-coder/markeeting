import React from "react";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";

/** The blog hub's banner (Hobbes Blog): the shared photo hero, without actions. */
export function EditorialHero() {
  return (
    <PhotoPageHero
      id="blog-heading"
      eyebrow="RedactPlus Blog"
      title="Blog"
      summary="Practical guidance for teams reviewing sensitive information, from finding what to redact to checking the final copy."
      landscape="dolomites"
    />
  );
}
