// Landing page for unauthenticated visitors.
//
// Before Phase 4b-5 the home URL rendered the family cookbook's
// public browse view. With multi-tenant + per-account onboarding,
// the right default for signed-out cooks is a sign-in / sign-up
// surface — both actions route through Cloudflare Access, which
// creates the account on first sign-in if it doesn't exist.
//
// Exceptions: /invite/:token (the invitee needs to see the
// preview before signing in) and any direct recipe URL still
// render their own surfaces, so a shared "look at this recipe"
// link doesn't get hijacked into a login wall.

import { Icon, signInUrl } from "./helpers.jsx";

export function SignedOutLanding() {
  return (
    <div className="landing-page" data-screen-label="00 Sign in / sign up">
      <div className="landing-hero">
        <img className="landing-mark" src="/images/heirloom-tomato-long.png" alt="Heirloom" />
        <div className="eyebrow">Welcome</div>
        <h1>The family cookbook,<br /><em>kept in the family.</em></h1>
        <p className="sub">
          Recipes from Babcia, Patricia, and everyone who cooks for our table — plus an AI sous-chef when you're stuck. Private by default, shared when you mean to.
        </p>

        <div className="landing-actions">
          <a className="btn primary" href={signInUrl()}>
            <Icon name="chef" size={15} /> Sign in
          </a>
          <a className="btn ghost" href={signInUrl()}>
            Create an account
          </a>
        </div>

        <p className="landing-foot">
          Same button — Cloudflare verifies your email and creates an account if it's your first visit. Family invitations go straight to your inbox.
        </p>
      </div>

      <div className="landing-features">
        <div className="feature">
          <div className="head">Cookbooks per household</div>
          <p>Personal cookbook for solo recipes, family cookbook for the people you cook with, shared cookbooks for friends.</p>
        </div>
        <div className="feature">
          <div className="head">Kitchen AI</div>
          <p>Snap a photo mid-cook — "does this look right?" — and get answers that actually reference your recipe.</p>
        </div>
        <div className="feature">
          <div className="head">Built for handing down</div>
          <p>Add a recipe by pasting text, snapping a card, or describing it. We do the structuring.</p>
        </div>
      </div>
    </div>
  );
}
