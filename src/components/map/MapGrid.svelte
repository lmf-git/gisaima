<script>
    import { userState } from '../../stores/user.js';
</script>

<div class="scene">
    {#each $userState.map as row, i}
        {#each row as cell, j}
            <div class="box">
                {i},{j}
            </div>
        {/each}
    {/each}
</div>

<style>
    :global(body) {
        background: #222;
        perspective: 1000px;
    }

    .scene {
        display: grid;
        grid-template-columns: repeat(10, 60px);
        grid-auto-rows: 60px;
        gap: 5px;
        transform-style: preserve-3d;
        transform: rotateX(60deg) rotateZ(45deg);
        width: fit-content;
        margin: 2rem auto;
    }

    .box {
        width: 100%;
        height: 100%;
        background: #3498db;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: Arial, sans-serif;
        color: white;
        font-weight: bold;
        border: 1px solid #2980b9;
    }
</style>
