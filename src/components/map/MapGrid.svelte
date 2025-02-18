<script>
    import { userState } from '../../stores/user.js';
</script>

<div class="grid">
    {#each $userState.map as row, i}
        <div class="row">
            {#each row as cell, j}
                <div class="cell">
                    {i},{j}
                </div>
            {/each}
        </div>
    {/each}
</div>

<style>
    .grid {
        display: flex;
        flex-direction: column;
        gap: 2px;
        background: #333;
        padding: 2px;
        width: fit-content;
    }

    .row {
        display: flex;
        gap: 2px;
    }

    .cell {
        width: 50px;
        height: 50px;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        color: #666;
    }
</style>
