// Signed-out landing page.
//
// Anonymous visitors land here at /. One CTA — Cloudflare Access
// handles both sign-in and account creation (first time you sign
// in IS the sign-up). Direct recipe (/recipe/:id) and invite
// (/invite/:token) URLs bypass this so shared links still work.

import { Icon, signInUrl } from "./helpers.jsx";

export function SignedOutLanding() {
  return (
    <div className="landing-page" data-screen-label="00 Sign in / sign up">
      <div className="landing-hero">
        <img className="landing-mark" src="/images/heirloom-tomato-long.png" alt="Heirloom" />
        <h1>The family cookbook,<br /><em>kept in the family.</em></h1>
        <p className="sub">
          Heirloom recipes, shared cookbooks, and a Kitchen AI that actually reads your steps.
        </p>

        <div className="landing-actions">
          <a className="btn primary" href={signInUrl()}>
            <Icon name="chef" size={15} /> Sign in / sign up with email
          </a>
        </div>
      </div>
    </div>
  );
}
