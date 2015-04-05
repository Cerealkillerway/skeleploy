oldProcess=$(forever list | grep paesidisandalmazzo)
if [ -n "$oldProcess" ] ; then
    echo 'already running'
else
    echo 'empty'
fi