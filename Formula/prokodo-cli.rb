# typed: false
# frozen_string_literal: true

# Homebrew formula for the prokodo developer CLI.
#
# This formula is maintained in prokodo-agency/homebrew-tap.
# It is updated automatically by the release pipeline on each new version.
# Do NOT edit url / sha256 / version by hand — they are managed by CI.
#
# To install:
#   brew tap prokodo-agency/tap
#   brew install prokodo-cli
class ProkodoCli < Formula
  desc "prokodo developer CLI — verify, inspect and manage your prokodo projects"
  homepage "https://prokodo.com"
  # Formula URL points to the tarball attached to the GitHub Release.
  # This is a public URL that requires no registry authentication,
  # making it compatible with Homebrew's download mechanism.
  # Pattern: https://github.com/prokodo-agency/cli/releases/download/vX.Y.Z/prokodo-cli-X.Y.Z.tgz
  url "https://github.com/prokodo-agency/cli/releases/download/v0.1.0/prokodo-cli-0.1.0.tgz"
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
