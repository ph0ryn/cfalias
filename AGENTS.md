# AGENTS.md

## 公開

パッケージ管理にはpnpmを使う。

公開前に`vp check`、`vp run test`、`pnpm pack --dry-run`を確認し、変更をコミットする。公開タグは`v<package.jsonのversion>`と一致させる。

```sh
pnpm version patch --message "chore(release): bump version to %s"
```

pushと公開はユーザーの承認後に行う。タグのpushで`.github/workflows/publish.yml`が公開を開始する。

```sh
git push origin main --follow-tags
```

公開後はGitHub Actionsの成功、npmへの反映とprovenanceを確認する。
