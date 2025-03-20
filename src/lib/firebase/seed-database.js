import { getDatabase, ref, set } from "firebase/database";

// The actual Firebase user ID
const REAL_USER_ID = "YnVJdZxPpPYw55gbzTwYBRkY4xm2";

// Initialize world and player data
export function seedDatabase() {
  const db = getDatabase();
  
  // Create worlds with seeds
  set(ref(db, 'worlds/fantasy-realm/info'), {
    name: "Fantasy Realm",
    description: "A magical world with vast forests and ancient ruins",
    seed: 8675309, // Specific seed for deterministic terrain generation
    created: Date.now(),
    playerCount: 1
  });
  
  set(ref(db, 'worlds/wasteland/info'), {
    name: "The Wasteland",
    description: "A harsh desert world with scarce resources",
    seed: 24601,
    created: Date.now(),
    playerCount: 1
  });
  
  // Create player profile data separate from worlds
  set(ref(db, `players/${REAL_USER_ID}/profile`), {
    displayName: "GisaimaWarrior2",
    email: "player1@example.com",
    joinDate: Date.now(),
    lastLogin: Date.now()
  });
  
  // Simple list of joined worlds with minimal metadata
  set(ref(db, `players/${REAL_USER_ID}/worlds`), {
    "fantasy-realm": {
      joined: Date.now(),
      lastVisited: Date.now()
    }
    // Can add more worlds like: "wasteland": { joined: Date.now() }
  });
  
  // Add some chunk data for the user
  set(ref(db, 'worlds/fantasy-realm/chunks/0,0/0,0'), {
    players: {
      [`${REAL_USER_ID}-character1`]: {
        displayName: "GisaimaWarrior2",
        lastActive: Date.now(),
        stats: {
          experience: 1250,
          level: 5,
          resources: {
            gold: 500,
            stone: 200,
            wood: 350
          }
        },
        uid: REAL_USER_ID
      }
    }
  });

  set(ref(db, 'worlds/fantasy-realm/chunks/0,0/0,1'), {
    structure: {
      health: 145,
      level: 2,
      name: "Northern Tower",
      owner: REAL_USER_ID,
      resources: {
        food: 40,
        stone: 50,
        wood: 60
      },
      type: "watchtower"
    }
  });
  
  set(ref(db, 'worlds/fantasy-realm/chunks/0,0/10,10'), {
    structure: {
      health: 132,
      level: 2,
      name: "Hidden Fort",
      owner: REAL_USER_ID,
      resources: {
        food: 90,
        stone: 60,
        wood: 75
      },
      type: "fortress"
    }
  });

  console.log("Database seeded with sample data!");
}
