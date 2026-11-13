# Kinosreda online avatar assets

The base human avatar is the local Ready Player Me GLB already included in the project. The idle, walk and jump motion clips in this folder come from the Ready Player Me Game-Ready Animation Library:

https://github.com/readyplayerme/animation-library

They are used locally by `beer-room-avatar.mjs`; the library license is included in `LICENSE.md`.

Additional fully rigged characters in `characters/` are the male and female
examples from Ready Player Me Visage, revision
`0eafdd9c4c10db079de2656c3eb59212a2fb7f63`:
https://github.com/readyplayerme/visage/tree/0eafdd9c4c10db079de2656c3eb59212a2fb7f63/public
Their MIT license is retained in `characters/LICENSE`. The bald, black-bearded
variant uses the male character with its hair hidden, a fitted beard generated
from the face geometry, and a darker jacket. All characters share the local
animation library and retain their original skin and clothing textures.
