# 계산·파일 형식

## 치트용 게임 식별값

`게임 코드 4자 + 공백 + 체크섬 8자리`로 표시합니다. 예: `IPGK F3E124C4`.

- 게임 코드: NDS 파일의 오프셋 `0x0C`부터 4바이트 ASCII.
- 체크섬: 오프셋 `0x000`~`0x1FF`의 512바이트에 **CRC-32/JAMCRC** 적용.
- 매개변수: width 32, polynomial `04C11DB7`, initial `FFFFFFFF`, reflected input/output, final XOR `00000000`.
- 표준 검사 문자열 `123456789`의 결과: `340BC6D9`.
- 파일 전체의 일반 CRC32나 NDS 헤더의 CRC16 필드와는 다릅니다.

## R4 DAT

지원 시그니처는 `R4 CheatCode`입니다. 게임 인덱스는 오프셋 `0x100`부터 시작하며 각 레코드는 16바이트입니다.

| 상대 위치 | 크기 | 내용 |
| --- | --- | --- |
| +0 | 4 | 게임 코드 ASCII |
| +4 | 4 | 치트용 CRC, little-endian |
| +8 | 8 | 게임 데이터 위치, little-endian |

데이터 위치가 0인 인덱스에서 끝납니다. 인덱스와 본문 영역의 겹침, 잘린 인덱스, 역순·범위 밖 위치를 거부합니다. 선택한 레코드의 앞 8바이트만 갱신하므로 게임 데이터 위치, 문자열 인코딩, 치트 코드 본문을 재구성할 필요가 없습니다.

## XML

`codelist` 바로 아래 `game`의 `gameid`만 대상으로 합니다. 문서 전체를 재직렬화하지 않습니다. 원문 위치를 찾아 해당 내용만 교체한 다음 같은 인코딩으로 기록합니다. 댓글·CDATA 안의 가짜 태그를 건너뛰고, 브라우저의 XML 파서로 문법을 먼저 검증합니다. DTD와 외부 엔티티는 허용하지 않습니다.

## 참고 자료

- [CRC RevEng: CRC-32/JAMCRC 매개변수](https://reveng.sourceforge.io/crc-catalogue/17plus.htm#crc.cat.crc-32-jamcrc)
- [TWiLight Menu++ cheat.cpp](https://github.com/DS-Homebrew/TWiLightMenu/blob/master/romsel_dsimenutheme/arm9/source/cheat.cpp): `romData`, `searchCheatData`를 계산 기준·포맷 대조에 참고.
- [TWiLight Menu++ cheat.h](https://github.com/DS-Homebrew/TWiLightMenu/blob/master/romsel_dsimenutheme/arm9/source/cheat.h): `sDatIndex` 필드 형식 대조.

참고 프로젝트의 소스 코드·리소스·치트 데이터베이스는 이 배포물에 포함하지 않았습니다. `core.js`는 위 계산 매개변수와 바이너리 구조를 바탕으로 작성한 독립 구현입니다.
