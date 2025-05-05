<script>
  // Current latest update month
  const latestUpdate = "April 2025";
</script>

<section class="changes-section">
  <div class="changes-container">
    <div class="changes-header">
      <h2>Latest Updates</h2>
      <p class="subtitle">Stay informed about the newest features and improvements to Gisaima</p>
    </div>

    <div class="changes-content">
      <div class="latest-update">
        <div class="update-badge">New</div>
        <h3>{latestUpdate} Update</h3>
        <p>
          Discover what's new in our latest release, including terrain improvements, 
          battle system enhancements, and performance optimizations.
        </p>
        <a href="/changes/april-2025" class="update-link">Read Update Notes</a>
      </div>

      <div class="all-changes">
        <h3>Previous Updates</h3>
        <p>
          Explore our complete history of changes, improvements, and feature additions
          that have shaped Gisaima into what it is today.
        </p>
        <a href="/changes" class="all-changes-link">View All Updates</a>
      </div>
    </div>
  </div>
</section>

<style>
  .changes-section {
    padding: 6em 1.5em;
    background: linear-gradient(to bottom, 
                rgba(17, 34, 64, 0.8), 
                rgba(10, 25, 47, 0.9));
    border-top: 1px solid var(--color-panel-border);
    border-bottom: 1px solid var(--color-panel-border);
  }

  .changes-container {
    max-width: 1140px;
    margin: 0 auto;
  }

  .changes-header {
    text-align: center;
    margin-bottom: 3em;
  }

  .changes-header h2 {
    font-family: var(--font-heading);
    font-size: 2.5em;
    color: var(--color-heading);
    margin-bottom: 0.5em;
    font-weight: 500;
  }

  .subtitle {
    color: var(--color-text-secondary);
    font-size: 1.1em;
    max-width: 600px;
    margin: 0 auto;
  }

  .changes-content {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2em;
  }

  .latest-update, .all-changes {
    background: rgba(17, 34, 64, 0.6);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5em;
    padding: 2em;
    box-shadow: 0 0.5em 1.5em rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .latest-update:hover, .all-changes:hover {
    transform: translateY(-5px);
    box-shadow: 0 0.8em 2em rgba(0, 0, 0, 0.25);
  }

  .latest-update:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 4px;
    background: var(--color-bright-accent);
  }

  .update-badge {
    position: absolute;
    top: 1em;
    right: 1em;
    background: var(--color-bright-accent);
    color: var(--color-dark-navy);
    font-weight: bold;
    padding: 0.3em 0.8em;
    border-radius: 2em;
    font-size: 0.8em;
    letter-spacing: 0.05em;
  }

  h3 {
    font-family: var(--font-heading);
    font-size: 1.5em;
    color: var(--color-text-primary);
    margin-bottom: 1em;
    font-weight: 500;
  }

  p {
    color: var(--color-text-secondary);
    margin-bottom: 1.5em;
    line-height: 1.6;
  }

  .update-link, .all-changes-link {
    display: inline-block;
    color: var(--color-bright-accent);
    text-decoration: none;
    font-weight: 500;
    padding: 0.5em 0;
    position: relative;
    transition: color 0.2s ease;
  }

  .update-link:after, .all-changes-link:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0;
    height: 2px;
    background: var(--color-bright-accent);
    transition: width 0.3s ease;
  }

  .update-link:hover:after, .all-changes-link:hover:after {
    width: 100%;
  }

  @media (min-width: 768px) {
    .changes-content {
      grid-template-columns: 3fr 2fr;
    }
  }
</style>
