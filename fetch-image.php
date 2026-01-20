<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
if (!$url || !preg_match('#^https?://#i', $url)) {
  http_response_code(400);
  exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 12);
curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT'] ?? 'Mozilla/5.0');
$data = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$mime = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'image/png';
curl_close($ch);

if ($http < 200 || $http >= 300 || !$data) {
  http_response_code(502);
  exit;
}

header('Content-Type: ' . $mime);
echo $data;
