// Doodle Dash words in three difficulty tiers (spec 003 R6.2).
(function (C) {
  const list = s => s.split(',').map(w => w.trim()).filter(Boolean);
  C.words = {
    easy: list(`cat, dog, house, sun, moon, tree, fish, car, apple, banana, ball, star, cloud, flower, hat, cake, bird,
      boat, book, chair, cup, door, egg, eye, face, fork, heart, key, kite, lamp, leaf, nose, pizza, rain, shoe, snake,
      sock, spoon, table, train, umbrella, bed, bus, cookie, crown, duck, frog, ghost, ice cream, ladder, mouse, pig,
      rainbow, robot, sheep, snail, snowman, spider, sword, tent, worm, bee, bone, candle, carrot, clock, cow, drum,
      glasses, hand, hammer, horse, igloo, lemon, lollipop, mushroom, owl, pear, pencil, phone`),
    medium: list(`airplane, balloon, bicycle, bridge, butterfly, cactus, camera, castle, dinosaur, dragon, elephant,
      giraffe, guitar, hamburger, helicopter, island, jellyfish, kangaroo, lighthouse, mermaid, mountain, octopus,
      penguin, pirate, pumpkin, rocket, sandwich, scissors, shark, skateboard, submarine, sunflower, teapot, toothbrush,
      tornado, tractor, treasure, unicorn, volcano, waterfall, whale, windmill, wizard, zebra, astronaut, backpack,
      bathtub, beach, campfire, crab, dolphin, envelope, fireworks, flamingo, hot dog, ice skates, lobster, map,
      microphone, parachute, peacock, piano, popcorn, raccoon, scarecrow, skeleton, sloth, snowflake, spaceship,
      stopwatch, swing, telescope, toaster, traffic light, trampoline, turtle, vampire, watermelon, yo-yo, zombie, anchor`),
    hard: list(`aquarium, avalanche, black hole, blizzard, bookshelf, chandelier, chess, compass, constellation,
      earthquake, eclipse, escalator, ferris wheel, fossil, gravity, hammock, haunted house, hourglass, jigsaw, juggler,
      labyrinth, lawnmower, magnet, marathon, mosquito, orchestra, pyramid, quicksand, recycling, rollercoaster,
      sandcastle, shadow, skyscraper, sleepwalking, stethoscope, thunderstorm, tightrope, time machine,
      vacuum cleaner, ventriloquist, waiter, wedding, wifi, x-ray, yoga`),
  };
})(window.HUDDLE_CONTENT = window.HUDDLE_CONTENT || {});
