const result = Bun.spawnSync(["react-doctor", "--staged", "--blocking", "warning"], {
  stdout: "ignore",
  stderr: "ignore",
});

if (result.exitCode !== 0) {
  process.stderr.write(
    "React Doctor found staged regressions.\n" +
      "Run react-doctor --staged --blocking warning to inspect.\n" +
      "Want them fixed? Ask your agent to run that command and resolve the findings.\n",
  );
  process.exit(1);
}

process.exit(0);
