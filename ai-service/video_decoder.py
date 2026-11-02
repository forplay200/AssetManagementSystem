"""Linux child-only resource limits before exec; never set limits on the model worker."""
import os
import resource
import sys

resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
resource.setrlimit(resource.RLIMIT_CPU, (45, 45))
resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024**2, 4 * 1024**2))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
os.execvp(sys.argv[1], sys.argv[1:])
