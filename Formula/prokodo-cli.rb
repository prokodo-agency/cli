# typed: false
# frozen_string_literal: true

# Homebrew formula for the prokodo developer CLI.
#
# This formula lives in the prokodo/homebrew-tap tap.
# To install:
#   brew tap prokodo/tap
#   brew install prokodo-cli
#
# To update the formula for a new release, change `url`, `sha256`,
# and the `version` field below.
class ProkodoCli < Formula
  desc "prokodo developer CLI — verify, inspect and manage your prokodo projects"
  homepage "https://github.com/prokodo/prokodo-cli"
  url "https://registry.npmjs.org/@prokodo/cli/-/cli-0.1.0.tgz"
  # Update sha256 with: curl -sL <url> | shasum -a 256
  sha256 "REPLACE_WITH_SHA256_OF_THE_TGZ"
  version "0.1.0"
  license "MIT"

  # Node ≥22 is required (same constraint as package.json engines field)
  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/prokodo --version")
    assert_match "Usage", shell_output("#{bin}/prokodo --help")
  end
end
