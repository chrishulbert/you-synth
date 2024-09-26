help:
	cat Makefile

serve:
	open https://localhost
	caddy file-server --domain localhost
