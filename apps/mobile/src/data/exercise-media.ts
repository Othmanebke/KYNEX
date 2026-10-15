import type { ExerciseAsset } from "@kynex/core";

/**
 * Photos d'exercices issues de free-exercise-db (github.com/yuhonas/free-exercise-db),
 * publiées sous The Unlicense (domaine public). Seules les correspondances fidèles sont
 * listées : un exercice sans équivalent exact n'a pas d'image plutôt qu'une image trompeuse.
 */
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
export const MEDIA_LICENSE = "The Unlicense (domaine public)";
export const MEDIA_SOURCE = "free-exercise-db";

const MAP: Record<string, { sourceId: string; sourceName: string; images: { path: string; sizeBytes: number }[] }> = {
  back_squat: { sourceId: "Barbell_Full_Squat", sourceName: "Barbell Full Squat", images: [{ path: "Barbell_Full_Squat/0.jpg", sizeBytes: 71421 }, { path: "Barbell_Full_Squat/1.jpg", sizeBytes: 70167 }] },
  goblet_squat: { sourceId: "Goblet_Squat", sourceName: "Goblet Squat", images: [{ path: "Goblet_Squat/0.jpg", sizeBytes: 34299 }, { path: "Goblet_Squat/1.jpg", sizeBytes: 34362 }] },
  leg_press: { sourceId: "Leg_Press", sourceName: "Leg Press", images: [{ path: "Leg_Press/0.jpg", sizeBytes: 84753 }, { path: "Leg_Press/1.jpg", sizeBytes: 83900 }] },
  romanian_deadlift: { sourceId: "Romanian_Deadlift", sourceName: "Romanian Deadlift", images: [{ path: "Romanian_Deadlift/0.jpg", sizeBytes: 59859 }, { path: "Romanian_Deadlift/1.jpg", sizeBytes: 57367 }] },
  deadlift: { sourceId: "Barbell_Deadlift", sourceName: "Barbell Deadlift", images: [{ path: "Barbell_Deadlift/0.jpg", sizeBytes: 69854 }, { path: "Barbell_Deadlift/1.jpg", sizeBytes: 67563 }] },
  hip_thrust: { sourceId: "Barbell_Hip_Thrust", sourceName: "Barbell Hip Thrust", images: [{ path: "Barbell_Hip_Thrust/0.jpg", sizeBytes: 53764 }, { path: "Barbell_Hip_Thrust/1.jpg", sizeBytes: 52252 }] },
  bench_press: { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sourceName: "Barbell Bench Press - Medium Grip", images: [{ path: "Barbell_Bench_Press_-_Medium_Grip/0.jpg", sizeBytes: 72816 }, { path: "Barbell_Bench_Press_-_Medium_Grip/1.jpg", sizeBytes: 72202 }] },
  dumbbell_bench_press: { sourceId: "Dumbbell_Bench_Press", sourceName: "Dumbbell Bench Press", images: [{ path: "Dumbbell_Bench_Press/0.jpg", sizeBytes: 63319 }, { path: "Dumbbell_Bench_Press/1.jpg", sizeBytes: 64120 }] },
  barbell_row: { sourceId: "Bent_Over_Barbell_Row", sourceName: "Bent Over Barbell Row", images: [{ path: "Bent_Over_Barbell_Row/0.jpg", sizeBytes: 64589 }, { path: "Bent_Over_Barbell_Row/1.jpg", sizeBytes: 66556 }] },
  one_arm_dumbbell_row: { sourceId: "One-Arm_Dumbbell_Row", sourceName: "One-Arm Dumbbell Row", images: [{ path: "One-Arm_Dumbbell_Row/0.jpg", sizeBytes: 70752 }, { path: "One-Arm_Dumbbell_Row/1.jpg", sizeBytes: 71407 }] },
  seated_cable_row: { sourceId: "Seated_Cable_Rows", sourceName: "Seated Cable Rows", images: [{ path: "Seated_Cable_Rows/0.jpg", sizeBytes: 65319 }, { path: "Seated_Cable_Rows/1.jpg", sizeBytes: 65659 }] },
  overhead_press: { sourceId: "Standing_Military_Press", sourceName: "Standing Military Press", images: [{ path: "Standing_Military_Press/0.jpg", sizeBytes: 56692 }, { path: "Standing_Military_Press/1.jpg", sizeBytes: 60380 }] },
  dumbbell_shoulder_press: { sourceId: "Dumbbell_Shoulder_Press", sourceName: "Dumbbell Shoulder Press", images: [{ path: "Dumbbell_Shoulder_Press/0.jpg", sizeBytes: 62474 }, { path: "Dumbbell_Shoulder_Press/1.jpg", sizeBytes: 63882 }] },
  lat_pulldown: { sourceId: "Wide-Grip_Lat_Pulldown", sourceName: "Wide-Grip Lat Pulldown", images: [{ path: "Wide-Grip_Lat_Pulldown/0.jpg", sizeBytes: 71951 }, { path: "Wide-Grip_Lat_Pulldown/1.jpg", sizeBytes: 71400 }] },
  walking_lunge: { sourceId: "Bodyweight_Walking_Lunge", sourceName: "Bodyweight Walking Lunge", images: [{ path: "Bodyweight_Walking_Lunge/0.jpg", sizeBytes: 77155 }, { path: "Bodyweight_Walking_Lunge/1.jpg", sizeBytes: 76877 }] },
  plank: { sourceId: "Plank", sourceName: "Plank", images: [{ path: "Plank/0.jpg", sizeBytes: 43296 }, { path: "Plank/1.jpg", sizeBytes: 43135 }] },
  dead_bug: { sourceId: "Dead_Bug", sourceName: "Dead Bug", images: [{ path: "Dead_Bug/0.jpg", sizeBytes: 45381 }, { path: "Dead_Bug/1.jpg", sizeBytes: 46759 }] },
  incline_push_up: { sourceId: "Incline_Push-Up", sourceName: "Incline Push-Up", images: [{ path: "Incline_Push-Up/0.jpg", sizeBytes: 69704 }, { path: "Incline_Push-Up/1.jpg", sizeBytes: 68439 }] },
  push_up: { sourceId: "Pushups", sourceName: "Pushups", images: [{ path: "Pushups/0.jpg", sizeBytes: 66786 }, { path: "Pushups/1.jpg", sizeBytes: 64283 }] },
  bench_dip: { sourceId: "Bench_Dips", sourceName: "Bench Dips", images: [{ path: "Bench_Dips/0.jpg", sizeBytes: 58381 }, { path: "Bench_Dips/1.jpg", sizeBytes: 58433 }] },
  parallel_bar_dip: { sourceId: "Dips_-_Triceps_Version", sourceName: "Dips - Triceps Version", images: [{ path: "Dips_-_Triceps_Version/0.jpg", sizeBytes: 71969 }, { path: "Dips_-_Triceps_Version/1.jpg", sizeBytes: 73290 }] },
  australian_row: { sourceId: "Inverted_Row", sourceName: "Inverted Row", images: [{ path: "Inverted_Row/0.jpg", sizeBytes: 57494 }, { path: "Inverted_Row/1.jpg", sizeBytes: 59968 }] },
  pull_up: { sourceId: "Pullups", sourceName: "Pullups", images: [{ path: "Pullups/0.jpg", sizeBytes: 42281 }, { path: "Pullups/1.jpg", sizeBytes: 40018 }] },
  bodyweight_squat: { sourceId: "Bodyweight_Squat", sourceName: "Bodyweight Squat", images: [{ path: "Bodyweight_Squat/0.jpg", sizeBytes: 37986 }, { path: "Bodyweight_Squat/1.jpg", sizeBytes: 41546 }] },
  split_squat: { sourceId: "Split_Squats", sourceName: "Split Squats", images: [{ path: "Split_Squats/0.jpg", sizeBytes: 30777 }, { path: "Split_Squats/1.jpg", sizeBytes: 31014 }] },
  glute_bridge: { sourceId: "Butt_Lift_Bridge", sourceName: "Butt Lift (Bridge)", images: [{ path: "Butt_Lift_Bridge/0.jpg", sizeBytes: 57056 }, { path: "Butt_Lift_Bridge/1.jpg", sizeBytes: 58796 }] },
  mountain_climber: { sourceId: "Mountain_Climbers", sourceName: "Mountain Climbers", images: [{ path: "Mountain_Climbers/0.jpg", sizeBytes: 30166 }, { path: "Mountain_Climbers/1.jpg", sizeBytes: 30259 }] },
  jump_squat: { sourceId: "Freehand_Jump_Squat", sourceName: "Freehand Jump Squat", images: [{ path: "Freehand_Jump_Squat/0.jpg", sizeBytes: 69522 }, { path: "Freehand_Jump_Squat/1.jpg", sizeBytes: 66114 }] },
  jump_rope_basic: { sourceId: "Rope_Jumping", sourceName: "Rope Jumping", images: [{ path: "Rope_Jumping/0.jpg", sizeBytes: 76449 }, { path: "Rope_Jumping/1.jpg", sizeBytes: 77380 }] },
  row_erg: { sourceId: "Rowing_Stationary", sourceName: "Rowing, Stationary", images: [{ path: "Rowing_Stationary/0.jpg", sizeBytes: 63420 }, { path: "Rowing_Stationary/1.jpg", sizeBytes: 61810 }] },
  farmer_carry: { sourceId: "Farmers_Walk", sourceName: "Farmer's Walk", images: [{ path: "Farmers_Walk/0.jpg", sizeBytes: 54501 }, { path: "Farmers_Walk/1.jpg", sizeBytes: 51227 }] },
  arm_circles: { sourceId: "Arm_Circles", sourceName: "Arm Circles", images: [{ path: "Arm_Circles/0.jpg", sizeBytes: 62421 }, { path: "Arm_Circles/1.jpg", sizeBytes: 63612 }] },
  cat_cow: { sourceId: "Cat_Stretch", sourceName: "Cat Stretch", images: [{ path: "Cat_Stretch/0.jpg", sizeBytes: 34137 }, { path: "Cat_Stretch/1.jpg", sizeBytes: 33861 }] },
  worlds_greatest_stretch: { sourceId: "Worlds_Greatest_Stretch", sourceName: "World's Greatest Stretch", images: [{ path: "Worlds_Greatest_Stretch/0.jpg", sizeBytes: 31621 }, { path: "Worlds_Greatest_Stretch/1.jpg", sizeBytes: 33472 }] },
  hamstring_stretch: { sourceId: "Hamstring_Stretch", sourceName: "Hamstring Stretch", images: [{ path: "Hamstring_Stretch/0.jpg", sizeBytes: 33462 }, { path: "Hamstring_Stretch/1.jpg", sizeBytes: 30817 }] },
  childs_pose: { sourceId: "Childs_Pose", sourceName: "Child's Pose", images: [{ path: "Childs_Pose/0.jpg", sizeBytes: 33306 }, { path: "Childs_Pose/1.jpg", sizeBytes: 33259 }] },
  standing_calf_stretch: { sourceId: "Calf_Stretch_Hands_Against_Wall", sourceName: "Calf Stretch Hands Against Wall", images: [{ path: "Calf_Stretch_Hands_Against_Wall/0.jpg", sizeBytes: 42218 }, { path: "Calf_Stretch_Hands_Against_Wall/1.jpg", sizeBytes: 30643 }] },
};

/** Images (début / fin du mouvement) d'un exercice, au format ExerciseAsset du socle. */
export function exerciseImages(exerciseId: string): ExerciseAsset[] {
  const m = MAP[exerciseId];
  if (!m) return [];
  return m.images.map((img) => ({
    kind: "image",
    uri: BASE + img.path,
    license: MEDIA_LICENSE,
    source: `${MEDIA_SOURCE} — ${m.sourceName}`,
    hosting: "remote",
    sizeBytes: img.sizeBytes,
    offline: true,
  }));
}

export const exercisesWithImages = (): string[] => Object.keys(MAP);
