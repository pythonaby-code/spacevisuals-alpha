$ErrorActionPreference = 'Stop'
$nodePath = 'C:/Program Files/nodejs/node.exe'
$adminPath = Join-Path $PSScriptRoot 'admin.mjs'
while ($true) {
    Write-Host ''
    Write-Host 'SpaceVisuals — управление Pro'
    Write-Host '1. Создать приглашение другу'
    Write-Host '2. Выдать другу Pro вручную'
    Write-Host '3. Посмотреть состояние акции'
    Write-Host '4. Включить подарок первому скачавшему'
    Write-Host '5. Приостановить акцию'
    Write-Host '0. Выйти'
    $choice = Read-Host 'Выбери действие'
    switch ($choice) {
        '1' { & $nodePath $adminPath invite; Write-Host 'Ссылка одноразовая, действует 30 дней. Для друзей на других ПК нужен опубликованный сайт и SITE_PUBLIC_URL.' }
        '2' { $friendNick = Read-Host 'Ник друга, уже вошедшего на сайт'; $proDays = Read-Host 'На сколько дней (Enter — 30)'; if (-not $proDays) { $proDays = '30' }; & $nodePath $adminPath grant-friend $friendNick $proDays }
        '3' { & $nodePath $adminPath status }
        '4' { Write-Host 'Победит первый вошедший в аккаунт участник, которому сервер полностью передаст архив. Друзья должны заранее войти по приглашениям.'; $answer = Read-Host 'Введи ВКЛЮЧИТЬ для запуска акции'; if ($answer -ceq 'ВКЛЮЧИТЬ') { & $nodePath $adminPath enable-gift } }
        '5' { & $nodePath $adminPath disable-gift }
        '0' { return }
        default { Write-Host 'Выбери номер от 0 до 5.' }
    }
}
