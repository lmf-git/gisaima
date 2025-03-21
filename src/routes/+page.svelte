<script>
  import Showcase from '../components/Showcase.svelte';
  import Features from '../components/Features.svelte';
  import Media from '../components/Media.svelte';
</script>

<svelte:head>
  <title>Gisaima - Territory Strategy MMO</title>
  <meta name="description" content="An open source territory control strategy game with infinite procedurally generated worlds. No pay-to-win mechanics, based on ancient board games with modern twists." />
</svelte:head>

<main class="container">
  <Showcase />
  <Media />
  <Features />
</main>

<style>
  .container {
    width: calc(100% - 1.5em);
    margin: 0 auto;
    color: var(--color-text);
  }

  /* Responsive styles */
  @media (min-width: 481px) {
    .container {
      width: calc(100% - 2.5em);
    }
  }

  @media (min-width: 769px) {
    .container {
      width: calc(100% - 5em);
      padding: 0;
    }
  }
</style>